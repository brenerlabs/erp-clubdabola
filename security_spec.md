# Security Specification - ERP CLUB DA BOLA

## 1. Data Invariants
- A `Sale` cannot be created without valid `items` and a `total` that matches the sum of items (logic enforced on client, rule checks existence).
- A `Transaction` of type `payment` must have a `customerId`.
- `totalDebt` in `Customer` can only be updated if the user is authenticated.
- Product prices cannot be negative.
- `createdAt` and `updatedAt` field must use `request.time`.

## 2. The Dirty Dozen (Payloads to Block)
1. **Anonymous Write**: Attempt to create a product without being signed in.
2. **Identity Spoofing**: Attempt to update another user's profile (if profiles were private, but here it's an admin app).
3. **Ghost Field Update**: Updating a product and adding `isDiscounted: true` which is not in schema.
4. **Negative Price**: Creating a product with `sellingPrice: -10`.
5. **Debt Reset**: A user trying to set their own `totalDebt` to `0` without creating a `Transaction`.
6. **Orphaned Sale**: Creating a sale for a non-existent `customerId`.
7. **Timestamp Poisoning**: Setting `createdAt` to a date in the past to manipulate reports.
8. **Resource Exhaustion**: Sending a 1MB string as a product name.
9. **Invalid Payment Method**: Setting `paymentMethod` to `Bitcoin`.
10. **Admin Escalation**: Attempting to create a document in the `admins` collection (if it exists).
11. **Shadow Transaction**: Creating a `Transaction` without updating the `Customer.totalDebt` (checked via batch logic).
12. **ID Poisoning**: Using a massive string with junk characters as a `productId`.

## 3. Test Runner (Mock Tests)
The logic below will be implemented in `firestore.rules`. All these must return `PERMISSION_DENIED`.

```typescript
// firestore.rules.test.ts
// (Conceptual tests to be verified by rules logic)

test('Anonymous user cannot create product', () => {
  assertFails(unauthedDb.collection('products').add({ name: 'Steal' }));
});

test('Product name too long', () => {
  assertFails(authedDb.collection('products').add({ name: 'a'.repeat(1000), ... }));
});

test('Negative selling price', () => {
  assertFails(authedDb.collection('products').add({ sellingPrice: -1, ... }));
});
```
