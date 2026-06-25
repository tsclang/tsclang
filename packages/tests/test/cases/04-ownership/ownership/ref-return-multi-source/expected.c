#include "runtime.h"

typedef struct { int32_t x; } Box;

const Box *pick_ref_Box_ref_Box_bool(const Box *a, const Box *b, bool flag) {
    return a;
}

int main(void) {
    TSC_INIT();
    Box b1 = {0};
    b1.x = 10;
    Box b2 = {0};
    b2.x = 20;
    const Box *r = pick_ref_Box_ref_Box_bool(&b1, &b2, true);
    printf("%d\n", r->x);
    return 0;
}
