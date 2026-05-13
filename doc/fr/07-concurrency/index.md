# Concurrence

[← Haut](../index.md) | [Suivant →](./async.md)

---

TSClang divise la concurrence en **trois mécanismes indépendants**, chacun opérant à son propre niveau d'abstraction et sur sa propre plateforme.

## Vue d'ensemble

| Mécanisme | Plateforme | Niveau | Description |
|-----------|----------|-------|-------------|
| `async/await` | toutes | standard | Boucle d'événements, machines à états, Promise |
| `std/threads` | OS (desktop/serveur) | avancé | Isolates, canaux, Atomic |
| `@embedded.isr` | embarqué (AVR/Cortex) | système | Interruptions matérielles, MMIO |

```
┌─────────────────────────────────────────────────────┐
│  Modèle de concurrence TSC                           │
│                                                      │
│  async/await ──── boucle d'événements ──── toutes   │
│       │                                              │
│       ├── Promise<T> — résultat des fonctions async  │
│       ├── AbortController — annulation coopérative   │
│       └── async generators — flux de données         │
│                                                      │
│  std/threads ───── isolates ────── OS uniquement     │
│       │                                              │
│       ├── channel<T>: transfert de propriété         │
│       ├── Atomic<T> / AtomicArray<T>: compteurs partagés│
│       ├── Readonly<T>: partage immuable zéro-copie   │
│       └── Thread<T>: résultat typé                   │
│                                                      │
│  @embedded.isr ─── ISR ─────────── embarqué uniquement│
│       │                                              │
│       ├── Volatile<T> — registres MMIO               │
│       ├── EmbeddedSignal — pont ISR → async          │
│       └── interrupts.disable() — sections critiques  │
└─────────────────────────────────────────────────────┘
```

## Principes clés

- **async/await** — boucle d'événements mono-thread, `Shared<T>` et `Weak<T>` ne sont pas atomiques, zéro surcharge
- **Threads** — isolates sans mémoire partagée, communication via canaux (transfert de propriété) ou `Atomic<T>`
- **ISR** — interruptions matérielles, pas de capture de contexte, tas interdit

## Async et threads — mondes séparés

`await` dans `Thread.spawn` — erreur de compilation. Un thread n'a pas de boucle d'événements. Le canal est le seul pont :

```
Boucle d'événements :  await rx.receive()  ←──────────────┐  non bloquant
                                                         │
Thread :               tx.send(result)  ────────────────┘  bloquant (si plein)
```

## Sous-pages

| Page | Description |
|------|-------------|
| [Async/Await](./async.md) | Machines à états, règles d'await, async main, AbortController, AsyncMutex |
| [Promise](./promise.md) | Promise<T>, .then/.catch/.finally, all/any/race/allSettled |
| [Threads](./threads.md) | Thread.spawn, Atomic<T>, AtomicArray<T>, Readonly<T>, Send-check |
| [Canaux et select](./channels.md) | channel<T>, MPMC borné, opérations ISR-safe, select |
| [ISR (Embarqué)](./isr.md) | @embedded.isr, Volatile<T>, std/sync, EmbeddedSignal |
| [Générateurs](./generators.md) | async function*, for await, close(), multitâche coopératif |

## Voir aussi

- [Modèle de mémoire](../05-memory/index.md) — propriété, vérificateur d'emprunt, Shared/Weak
- [Erreurs](../06-errors/index.md) — throws, try/catch, opérateur ?
- [Modules et plateformes](../08-modules/index.md) — runtime, profils de plateforme
