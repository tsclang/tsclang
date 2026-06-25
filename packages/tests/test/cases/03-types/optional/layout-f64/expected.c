#include "runtime.h"

typedef struct { bool has_value; double value; } opt_f64;

int main(void) {
    TSC_INIT();
    opt_f64 x = {true, 3.14};
    return 0;
}
