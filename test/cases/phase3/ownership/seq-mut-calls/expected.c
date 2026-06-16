#include "runtime.h"

typedef struct { int32_t value; } Box;

void bump_mut_Box(Box *m) {
    m->value = (int32_t)((uint32_t)m->value + (uint32_t)1);
}

int main(void) {
    TSC_INIT();
    Box b = {0};
    b.value = 0;
    bump_mut_Box(&b);
    bump_mut_Box(&b);
    printf("%d\n", b.value);
    return 0;
}
