#include "runtime.h"

int main(void) {
    TSC_INIT();
    double cafu00e9 = 5.0;
    printf("%s\n", tsc_dtoa((double)(cafu00e9)));
    return 0;
}
