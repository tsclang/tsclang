#include "runtime.h"

typedef struct { int32_t _refcount; int32_t _weakcount; int32_t value; } Data;

int main(void) {
    TSC_INIT();
    Data *d = tsc_arc_alloc(sizeof(Data));
    d->value = 42;
    Data *w = tsc_weak_create(d);
    Data *strong = tsc_weak_upgrade(w);
    if (strong != NULL) {
        printf("%d\n", strong->value);
        tsc_arc_release(strong);
    } else {
        printf("%g\n", -1.0);
    }
    tsc_weak_release(w);
    tsc_arc_release(d);
    return 0;
}

