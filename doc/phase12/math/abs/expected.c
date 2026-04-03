#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%d\n", (int)abs(-5));
    return 0;
}
