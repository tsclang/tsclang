#include "runtime.h"

typedef struct { int32_t value; } Box;

void bump_mut_Box(Box *m) {
    m->value += 1;
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
