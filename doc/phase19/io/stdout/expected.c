#include "runtime.h"
#include "std/io.h"

int main(void) {
    TSC_INIT();
    TscWriter writer = tsc_stdout();
    return 0;
}
