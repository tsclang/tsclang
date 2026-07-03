#include "runtime.h"

typedef struct INode INode;
struct INode { int32_t value; INode * next; };

int main(void) {
    TSC_INIT();
    return 0;
}
