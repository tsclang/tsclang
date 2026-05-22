#include "runtime.h"

typedef struct { int32_t _refcount; int32_t _weakcount; int32_t val; } Counter;

Counter *identity_shared_Counter(Counter *c) {
    tsc_arc_retain(c);
    return c;
}

int main(void) {
    TSC_INIT();
    Counter *counter = tsc_arc_alloc(sizeof(Counter));
    counter->val = 42;
    Counter *result = identity_shared_Counter(counter);
    printf("%d\n", result->val);
    tsc_arc_release(counter);
    return 0;
}
