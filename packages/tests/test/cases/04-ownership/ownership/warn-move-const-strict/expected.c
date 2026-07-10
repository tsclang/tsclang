#include "runtime.h"

typedef struct { int32_t x; } Obj;

int main(void) {
    TSC_INIT();
    Obj o = {0};
    o.x = 1;
    Obj p = o;
    printf("%d\n", p.x);
    return 0;
}
