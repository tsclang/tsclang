#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%d\n", 10 % 3);
    return 0;
}
