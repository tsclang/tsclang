#include "runtime.h"

typedef struct { int32_t x; } Box;

Box *getMut_mut_Box(Box *b) {
    return b;
}

int main(void) {
    TSC_INIT();
    Box box = {0};
    box.x = 42;
    Box *m = getMut_mut_Box(&box);
    m->x = 10;
    printf("%d\n", m->x);
    return 0;
}
