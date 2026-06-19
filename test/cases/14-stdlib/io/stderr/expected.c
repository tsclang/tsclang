#include "runtime.h"
#include "std/io.h"

int main(void) {
    TSC_INIT();
    TscWriter writer = tsc_stderr();
    return 0;
}
