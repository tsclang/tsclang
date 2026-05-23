#include "runtime.h"

typedef struct { int32_t _refcount; int32_t _weakcount; int32_t value; } Data;

int main(void) {
    TSC_INIT();
    Data *w = NULL;
    {
        Data *d = tsc_arc_alloc(sizeof(Data));
        d->value = 42;
        w = tsc_weak_create(d);
        tsc_arc_release(d);
    }
    Data *strong = tsc_weak_upgrade(w);
    if (strong != NULL) {
        printf("BUG\n");
        tsc_arc_release(strong);
    } else {
        printf("safe\n");
    }
    tsc_weak_release(w);
    return 0;
}
