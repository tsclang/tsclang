#include "runtime.h"

typedef struct ILeaf ILeaf;
struct ILeaf { int32_t value; const ILeaf * child; };

int main(void) {
    TSC_INIT();
    return 0;
}
