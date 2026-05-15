#include "runtime.h"

typedef struct { int32_t count; } Counter;

static Counter ctr = {0};

void inc_mut_Counter(Counter *c) {
    c->count += 1;
}

int main(void) {
    TSC_INIT();
    inc_mut_Counter(&ctr);
    inc_mut_Counter(&ctr);
    inc_mut_Counter(&ctr);
    printf("%d\n", ctr.count);
    return 0;
}
