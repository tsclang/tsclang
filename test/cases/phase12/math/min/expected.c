#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%d\n", (3 < 5) ? 3 : 5);
    printf("%d\n", (3 > 5) ? 3 : 5);
    return 0;
}
