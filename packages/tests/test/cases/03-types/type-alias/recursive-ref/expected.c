#include "runtime.h"

typedef struct Tree Tree;
struct Tree { int32_t value; const Tree * left; const Tree * right; };

int main(void) {
    TSC_INIT();
    return 0;
}
