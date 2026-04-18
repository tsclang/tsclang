#include "runtime.h"

int main(int argc, char **argv) {
    TSC_INIT();
    Array_string _argv = tsc_make_argv(argc, argv);
    printf("args: %s %s\n", _argv.data[1].data, _argv.data[2].data);
    return 0;
}
