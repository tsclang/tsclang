#include "runtime.h"

typedef struct { int32_t _refcount; int32_t _weakcount; int32_t x; } Data;

int main(void) {
    TSC_INIT();
    Data *d = tsc_arc_alloc(sizeof(Data));
    d->x = 7;
    Data *w = tsc_weak_create(d);
    Data *a = tsc_weak_upgrade(w);
    if (a != NULL) {
        printf("%d\n", a->x);
        tsc_arc_release(a);
    }
    Data *b = tsc_weak_upgrade(w);
    if (b != NULL) {
        printf("%d\n", b->x);
        tsc_arc_release(b);
    }
    tsc_weak_release(w);
    tsc_arc_release(d);
    return 0;
}
