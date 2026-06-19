#include "runtime.h"

typedef struct { int32_t x; } Foo;

int main(void) {
    TSC_INIT();
    Foo f = {0};
    if (1) {
        printf("always\n");
    }
    return 0;
}
