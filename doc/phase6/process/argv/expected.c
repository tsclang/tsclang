#include "runtime.h"

int main(int argc, char **argv) {
    TSC_INIT();
    Array_string _argv = tsc_make_argv(argc, argv);
    printf("%zu\n", _argv.length);
    return 0;
}
