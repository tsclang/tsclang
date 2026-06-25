#include "runtime.h"

void greet(void) {
    printf("hello\n");
}

int main(void) {
    TSC_INIT();
    greet();
    return 0;
}
