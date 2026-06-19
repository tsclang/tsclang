#include "runtime.h"
#include <stdio.h>

int main(void) {
    TSC_INIT();
    printf("%d\n", 42);
    printf("%s\n", "hello");
    printf("%g\n", 3.14);
    return 0;
}
