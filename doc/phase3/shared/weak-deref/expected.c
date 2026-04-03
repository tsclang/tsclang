#include "runtime.h"

typedef struct { int32_t _refcount; int32_t _weakcount; int32_t x; } Data;

int main(void) {
    TSC_INIT();
    Data *d = tsc_arc_alloc(sizeof(Data));
    d->x = 99;
    Data *w = tsc_weak_create(d);
    Data *strong = tsc_weak_upgrade(w);
    if (strong != NULL) {
        printf("%d\n", strong->x);
        tsc_arc_release(strong);
    }
    tsc_weak_release(w);
    tsc_arc_release(d);
    return 0;
}
