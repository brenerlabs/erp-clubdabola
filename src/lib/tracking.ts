import { db, handleFirestoreError, OperationType } from './firebase';
import { collection, query, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Shipment } from '../types';

/**
 * Representa um evento de rastreio retornado pela API dos Correios.
 */
export interface CorreiosEvent {
  data: string;
  hora: string;
  local: string;
  status?: string;
  descricao?: string;
  subStatus?: string[];
  detalhes?: string;
  unidade?: string;
}

/**
 * Resultado estruturado da consulta à API de rastreamento.
 */
export interface TrackingResult {
  success: boolean;
  trackingCode: string;
  eventos: CorreiosEvent[];
  error?: string;
}

/**
 * Expressão regular oficial para verificar códigos de rastreamento do padrão Correios (Ex: AA123456789BR).
 */
export const CORREIOS_TRACKING_REGEX = /^[A-Z]{2}[0-9]{9}[A-Z]{2}$/;

/**
 * Mapeia os eventos textuais da API dos Correios para os status internos estruturados do ERP.
 * 
 * @param statusText Descrição do evento de rastreio (Ex: "Objeto postado", "Objeto entregue ao destinatário")
 * @param localText Unidade ou região onde o evento ocorreu 
 * @returns Status compatível para o lote de importação do ERP Club da Bola
 */
export function mapCorreiosEventToERPStatus(statusText: string, localText = ''): Shipment['status'] {
  const norm = statusText.toLowerCase();
  const normLocal = localText.toLowerCase();
  
  if (norm.includes('entregue') || norm.includes('objeto entregue')) {
    return 'Entregue';
  }
  if (
    norm.includes('objeto disponível para retirada') || 
    norm.includes('aguardando retirada') || 
    norm.includes('endereço indicado') || 
    (normLocal.includes('unidade de distribuição') && norm.includes('retirada'))
  ) {
    return 'Recebido';
  }
  if (
    norm.includes('fiscalização') || 
    norm.includes('taxa') || 
    norm.includes('aduaneira') || 
    norm.includes('retido') || 
    norm.includes('tributado') || 
    norm.includes('pagamento') ||
    norm.includes('aguardando pagamento')
  ) {
    return 'Fiscalização';
  }
  if (
    norm.includes('recebido no brasil') || 
    norm.includes('unidade de tratamento internacional - recebido') || 
    norm.includes('chegou no brasil') ||
    ((norm.includes('conferido') || norm.includes('recebido')) && normLocal.includes('internacional'))
  ) {
    return 'Chegou no Brasil';
  }
  if (
    norm.includes('unidade de distribuição') && 
    (norm.includes('trânsito') || norm.includes('encaminhado') || norm.includes('saída para entrega'))
  ) {
    return 'Em trânsito para o destino final';
  }
  if (
    norm.includes('trânsito') || 
    norm.includes('encaminhado') || 
    norm.includes('objeto encaminhado')
  ) {
    return 'Em Trânsito';
  }
  if (
    norm.includes('postado') || 
    norm.includes('objeto postado') || 
    norm.includes('postagem')
  ) {
    return 'Postado';
  }
  return 'Processando';
}

/**
 * Realiza a consulta de um código específico de rastreamento através do wrapper da BrasilAPI.
 * 
 * @param trackingCode Código de rastreamento do padrão Correios (Ex: NM091238491BR)
 * @returns Resultado detalhado da consulta contendo os eventos
 */
export async function fetchTrackingFromCorreios(trackingCode: string): Promise<TrackingResult> {
  const codeFormatted = trackingCode.trim().toUpperCase();
  
  if (!CORREIOS_TRACKING_REGEX.test(codeFormatted)) {
    return {
      success: false,
      trackingCode: codeFormatted,
      eventos: [],
      error: 'Código de rastreamento inválido de acordo com o padrão dos Correios.'
    };
  }

  try {
    const url = `https://brasilapi.com.br/api/correios/v1/${codeFormatted}`;
    const response = await fetch(url);
    
    if (response.status === 404) {
      return {
        success: false,
        trackingCode: codeFormatted,
        eventos: [],
        error: 'Código não encontrado nos Correios brasileiras. Pode demorar até 5 dias para novos lotes serem logados.'
      };
    }

    if (!response.ok) {
      return {
        success: false,
        trackingCode: codeFormatted,
        eventos: [],
        error: `Servidor dos Correios respondeu com status HTTP ${response.status}.`
      };
    }

    const data = await response.json();
    const eventos: CorreiosEvent[] = data.eventos || [];
    
    return {
      success: true,
      trackingCode: codeFormatted,
      eventos
    };
  } catch (error) {
    console.error(`Erro ao consultar rastreio do código ${codeFormatted}:`, error);
    return {
      success: false,
      trackingCode: codeFormatted,
      eventos: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Varre o estoque/lotes do Firestore à procura de status pendentes (não "Entregue")
 * para sincronizar e automatizar todo o funil operacional do ERP Club da Bola.
 */
export async function syncAllPendingShipments(): Promise<{
  successCount: number;
  updatedCount: number;
  failedCount: number;
  details: { trackingCode: string; prevStatus: string; currentStatus: string; updated: boolean }[];
}> {
  let successCount = 0;
  let updatedCount = 0;
  let failedCount = 0;
  const details: { trackingCode: string; prevStatus: string; currentStatus: string; updated: boolean }[] = [];

  const collectionsPath = 'shipments';
  let shipmentsList: Shipment[] = [];

  try {
    const querySnapshot = await getDocs(collection(db, collectionsPath));
    shipmentsList = querySnapshot.docs.map(docSnapshot => ({
      id: docSnapshot.id,
      ...docSnapshot.data()
    } as Shipment));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionsPath);
  }

  // Filtrando remessas válidas que não foram entregues ainda
  const pendingShipments = shipmentsList.filter(ship => {
    const code = (ship.trackingCode || '').trim().toUpperCase();
    const isValid = CORREIOS_TRACKING_REGEX.test(code);
    const isPending = ship.status !== 'Entregue';
    return isValid && isPending;
  });

  for (const ship of pendingShipments) {
    const trackerCode = ship.trackingCode.trim().toUpperCase();
    const result = await fetchTrackingFromCorreios(trackerCode);

    if (result.success && result.eventos.length > 0) {
      successCount++;
      const topEvent = result.eventos[0];
      const apiStatus = topEvent.status || topEvent.descricao || '';
      const apiLocal = topEvent.local || topEvent.unidade || '';
      
      const mappedStatus = mapCorreiosEventToERPStatus(apiStatus, apiLocal);
      const previousStatus = ship.status;
      const docRef = doc(db, 'shipments', ship.id!);

      const payload: Partial<Shipment> = {
        correiosHistory: result.eventos,
        lastSyncedAt: new Date().toISOString()
      };

      const hasChanged = mappedStatus !== previousStatus;

      if (hasChanged) {
        updatedCount++;
        payload.status = mappedStatus;
        
        const trackingHistory = [...(ship.history || [])];
        trackingHistory.push({
          status: mappedStatus,
          updatedAt: new Date().toISOString(),
          notes: `Sincronização Integrada dos Correios: ${apiStatus}`
        });

        payload.history = trackingHistory;
        payload.updatedAt = serverTimestamp();
      }

      try {
        await updateDoc(docRef, payload as any);
        details.push({
          trackingCode: trackerCode,
          prevStatus: previousStatus,
          currentStatus: mappedStatus,
          updated: hasChanged
        });
      } catch (err) {
        console.error(`Erro ao salvar atualização do rastreio no Firestore para ID ${ship.id}:`, err);
        failedCount++;
      }

    } else {
      failedCount++;
      details.push({
        trackingCode: ship.trackingCode,
        prevStatus: ship.status,
        currentStatus: ship.status,
        updated: false
      });
    }
  }

  return {
    successCount,
    updatedCount,
    failedCount,
    details
  };
}

/**
 * Consulta e atualiza de forma autônoma uma única remessa baseada em seu ID do Firestore.
 * 
 * @param shipmentId Identificador do documento de lote no Firestore
 */
export async function syncSingleShipmentById(shipmentId: string): Promise<{
  success: boolean;
  statusChanged: boolean;
  newStatus?: Shipment['status'];
  error?: string;
}> {
  const path = `shipments/${shipmentId}`;
  
  try {
    const docSnapshot = await getDocs(collection(db, 'shipments'));
    const matchedDoc = docSnapshot.docs.find(d => d.id === shipmentId);
    
    if (!matchedDoc) {
      return { success: false, statusChanged: false, error: 'Encomenda com ID especificado não foi localizada.' };
    }

    const shipData = { id: matchedDoc.id, ...matchedDoc.data() } as Shipment;
    const trackerCode = (shipData.trackingCode || '').trim().toUpperCase();

    if (!CORREIOS_TRACKING_REGEX.test(trackerCode)) {
      return { success: false, statusChanged: false, error: `Código de rastreio '${trackerCode}' é inválido para formatação dos Correios.` };
    }

    const result = await fetchTrackingFromCorreios(trackerCode);

    if (result.success && result.eventos.length > 0) {
      const topEvent = result.eventos[0];
      const apiStatus = topEvent.status || topEvent.descricao || '';
      const apiLocal = topEvent.local || topEvent.unidade || '';
      
      const mappedStatus = mapCorreiosEventToERPStatus(apiStatus, apiLocal);
      const isChanged = mappedStatus !== shipData.status;

      const docRef = doc(db, 'shipments', shipmentId);
      const payload: Partial<Shipment> = {
        correiosHistory: result.eventos,
        lastSyncedAt: new Date().toISOString()
      };

      if (isChanged) {
        payload.status = mappedStatus;
        const trackingHistory = [...(shipData.history || [])];
        trackingHistory.push({
          status: mappedStatus,
          updatedAt: new Date().toISOString(),
          notes: `Atualização avulsa via API Integrada: ${apiStatus}`
        });
        payload.history = trackingHistory;
        payload.updatedAt = serverTimestamp();
      }

      await updateDoc(docRef, payload as any);

      return {
        success: true,
        statusChanged: isChanged,
        newStatus: mappedStatus
      };
    } else {
      return {
        success: false,
        statusChanged: false,
        error: result.error || 'Nenhum evento registrado pela aduana nacional até o momento.'
      };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    return {
      success: false,
      statusChanged: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
