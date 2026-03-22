# stateEdges.ts

This StateEdge edge is the most important and complex edge type. So I though a readme would be required for this.

Detects `READS_FROM` and `WRITES_TO` edges between components/hooks and state stores.

---

## How It Works

During parsing, every component and hook stores a `hooks` array in its metadata:

```typescript
metadata: {
  hooks: ["useState", "useCartStore", "useSelector", "useRouter"]
}
```

The detector cross-references this array against `storeNodes` from the lookup map to find which hooks are actual state stores we extracted. Built-ins like `useState` and framework hooks like `useRouter` are naturally ignored because they don't exist in `storeNodes`.

---

## Detection By Library

### Zustand
```typescript
const items = useCartStore(state => state.items)    // read
const addItem = useCartStore(state => state.addItem) // write
```
Both reads and writes use the same hook call pattern. We cannot distinguish without expensive type analysis so we create both `READS_FROM` and `WRITES_TO` when a Zustand store hook is found.

### Redux
```typescript
const items = useSelector(state => state.cart.items) // read
const dispatch = useDispatch()                        // write
```
`useSelector` → `READS_FROM` only  
`useDispatch` → `WRITES_TO` only  
We connect to all Redux stores found since Redux typically has one global store.

### Context
```typescript
const { user, setUser } = useContext(AuthContext)
```
`useContext` → both `READS_FROM` and `WRITES_TO`  
The argument `AuthContext` tells us which context store to connect to.

### Recoil
```typescript
const items = useRecoilValue(cartAtom)        // read
const setItems = useSetRecoilState(cartAtom)  // write
const [x, setX] = useRecoilState(cartAtom)   // both
```
`useRecoilValue` → `READS_FROM` only  
`useSetRecoilState` → `WRITES_TO` only  
`useRecoilState` → both

### Jotai
```typescript
const items = useAtomValue(cartAtom)   // read
const setItems = useSetAtom(cartAtom)  // write
const [x, setX] = useAtom(cartAtom)   // both
```
`useAtomValue` → `READS_FROM` only  
`useSetAtom` → `WRITES_TO` only  
`useAtom` → both

---

## Algorithm

```
Build storesByName map from storeNodes

For each COMPONENT or HOOK node:
  get metadata.hooks array
  for each hook name:
    not in storesByName? → skip
    found → check storeType → create appropriate edge(s)
```

---

## Output

```typescript
{
  from: "src/components/CheckoutButton.tsx::CheckoutButton",
  to: "src/store/cartStore.ts::useCartStore",
  type: "READS_FROM",
  metadata: {
    hookUsed: "useCartStore",
    storeType: "zustand"
  }
}
```