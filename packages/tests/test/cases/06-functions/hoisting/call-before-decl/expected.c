#include "runtime.h"

double helper(void) {
    return 41;
}

double _tsc_main(void) {
    return helper() + 1;
}

int main(void) {
    TSC_INIT();
    printf("%s\n", tsc_dtoa((double)(_tsc_main())));
    return _tsc_main();
}
