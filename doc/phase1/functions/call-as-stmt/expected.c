#include "runtime.h"

void doSomething(void) {
    printf("done\n");
}

int main(void) {
    TSC_INIT();
    doSomething();
    return 0;
}
