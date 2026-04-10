#include "runtime.h"
#include <math.h>

int main(void) {
    TSC_INIT();
    printf("%s\n", (M_SQRT1_2 > 0.7) ? "true" : "false");
    printf("%s\n", (M_SQRT1_2 < 0.8) ? "true" : "false");
    return 0;
}
