#include "runtime.h"

typedef struct { int32_t x; } Data;

int main(void) {
    TSC_INIT();
    printf("ok\n");
    return 0;
}
