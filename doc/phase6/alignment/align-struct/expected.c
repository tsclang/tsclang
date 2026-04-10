#include "runtime.h"

typedef struct __attribute__((aligned(16))) { float x; float y; float z; float w; } SimdVector;

int main(void) {
    TSC_INIT();
    return 0;
}
