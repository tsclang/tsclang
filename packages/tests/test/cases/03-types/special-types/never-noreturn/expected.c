#include "runtime.h"

_Noreturn void fail_string(String msg) {
    tsc_throw(msg);
}

int main(void) {
    TSC_INIT();
    return 0;
}
