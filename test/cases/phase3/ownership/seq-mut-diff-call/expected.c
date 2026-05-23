#include "runtime.h"

typedef struct { int32_t x; } Box;

void take_mut_Box(Box *m) {
    m->x = 2;
}

void take2_mut_Box(Box *m) {
    m->x = 3;
}

int main(void) {
    TSC_INIT();
    Box b = {0};
    b.x = 1;
    take_mut_Box(&b);
    take2_mut_Box(&b);
    return 0;
}
