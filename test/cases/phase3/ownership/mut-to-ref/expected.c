#include "runtime.h"

typedef struct { int32_t value; } Counter;

void increment_mut_Counter(Counter *c) {
    c->value += 1;
}

int32_t read_ref_Counter(const Counter *c) {
    return c->value;
}

int main(void) {
    TSC_INIT();
    Counter cnt = {0};
    cnt.value = 0;
    increment_mut_Counter(&cnt);
    increment_mut_Counter(&cnt);
    printf("%d\n", read_ref_Counter(&cnt));
    return 0;
}
