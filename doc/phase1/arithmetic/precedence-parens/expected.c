#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%d\n", (2 + 3) * 4);
    return 0;
}
