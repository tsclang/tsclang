#include "runtime.h"

typedef struct { int32_t a; int32_t b; } _fromEntries_0;

int main(void) {
    TSC_INIT();
    _fromEntries_0 obj = {.a = 1, .b = 2};
    printf("%d\n", obj.a);
    printf("%d\n", obj.b);
    return 0;
}
