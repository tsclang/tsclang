#include "runtime.h"

typedef struct { double _0; bool _1; } tuple_f64_bool;

tuple_f64_bool getPair(void) {
    const tuple_f64_bool result = {._0 = 3.14, ._1 = true};
    return result;
}

int main(void) {
    TSC_INIT();
    const double x = getPair()._0;
    const bool y = getPair()._1;
    printf("%s\n", tsc_dtoa((double)(x)));
    printf("%s\n", (y) ? "true" : "false");
    return 0;
}
