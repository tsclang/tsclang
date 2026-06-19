#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%s\n", (M_PI > 3.14) ? "true" : "false");
    printf("%s\n", (M_E > 2.71) ? "true" : "false");
    printf("%s\n", (M_SQRT2 > 1.41) ? "true" : "false");
    printf("%s\n", (M_SQRT1_2 > 0.70) ? "true" : "false");
    printf("%s\n", (M_LN2 > 0.69) ? "true" : "false");
    printf("%s\n", (M_LN10 > 2.30) ? "true" : "false");
    printf("%s\n", (M_LOG2E > 1.44) ? "true" : "false");
    printf("%s\n", (M_LOG10E > 0.43) ? "true" : "false");
    return 0;
}
