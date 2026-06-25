#include "runtime.h"

typedef struct { int32_t x; int32_t y; } V2;
typedef struct { V2 pos; int32_t scale; } Transform;

int main(void) {
    TSC_INIT();
    return 0;
}
