#include "runtime.h"

int32_t _tsc_main(void) {
    return 0;
}

int main(void) {
    TSC_INIT();
    return _tsc_main();
}
