import React from 'react';
import { motion } from 'motion/react';

interface RollingCounterProps {
  value: string | number;
  className?: string;
}

export function RollingCounter({ value, className = '' }: RollingCounterProps) {
  const str = String(value);

  return (
    <span className={`inline-flex items-baseline overflow-hidden ${className}`}>
      {str.split('').map((char, index) => {
        const isDigit = /^[0-9]$/.test(char);

        if (!isDigit) {
          return (
            <span key={index} className="inline-block whitespace-pre">
              {char}
            </span>
          );
        }

        return <Digit key={index} char={char} />;
      })}
    </span>
  );
}

function Digit({ char }: { char: string; key?: React.Key }) {
  const digitValue = parseInt(char, 10);

  return (
    <span className="relative inline-block h-[1.15em] overflow-hidden leading-none vertical-middle">
      {/* Invisible backing digit to allocate standard responsive layout width and height */}
      <span className="invisible opacity-0 select-none pointer-events-none">8</span>
      <motion.span
        initial={{ y: 0 }}
        animate={{ y: `-${digitValue * 10}%` }}
        transition={{
          type: 'spring',
          stiffness: 75,
          damping: 14,
          mass: 0.8,
        }}
        className="absolute left-0 top-0 flex flex-col w-full h-[1000%]"
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <span 
            key={num} 
            className="h-[10%] flex items-center justify-center font-sans tracking-normal select-none"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {num}
          </span>
        ))}
      </motion.span>
    </span>
  );
}
