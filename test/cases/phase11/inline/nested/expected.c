#include "runtime.h"

typedef struct { float x; float y; } V2;
typedef struct { V2 pos; float scale; } Transform;

int main(void) {
    TSC_INIT();
    return 0;
}
