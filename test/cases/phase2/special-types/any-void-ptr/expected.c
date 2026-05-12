#include "runtime.h"

void *passthrough(void *x) {
    return x;
}

int main(void) {
    TSC_INIT();
    return 0;
}
