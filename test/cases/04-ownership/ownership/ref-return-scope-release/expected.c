#include "runtime.h"

typedef struct { int32_t x; } Box;

const Box *getRef_ref_Box(const Box *b) {
    return b;
}

int main(void) {
    TSC_INIT();
    Box box = {0};
    box.x = 42;
    {
        const Box *r = getRef_ref_Box(&box);
        printf("%d\n", r->x);
    }
    box.x = 99;
    printf("%d\n", box.x);
    return 0;
}
