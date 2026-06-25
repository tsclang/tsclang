#include "runtime.h"

void greet(void) {
    printf("hello desktop\n");
}

int main(void) {
    TSC_INIT();
    greet();
    return 0;
}
