#include "runtime.h"
#include "std/io.h"

int main(void) {
    TSC_INIT();
    TscReader reader = tsc_stdin();
    return 0;
}
