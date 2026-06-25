#include "runtime.h"

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(fmod(10, 3))));
    return 0;
}
