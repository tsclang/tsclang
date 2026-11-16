#include "runtime.h"

static double counter;

static double _lambda_0_f64(void *_env) {
    counter = counter + 1;
    return counter;
}

static double counter = 0.0;

void bump(void) {
    counter = counter + 1;
}

int main(void) {
    TSC_INIT();
    tsc_closure f = {.env = NULL, .fn = (void*)_lambda_0_f64};
    printf("%s\n", tsc_dtoa((double)(((double (*)(void *))f.fn)(f.env))));
    bump();
    printf("%s\n", tsc_dtoa((double)(counter)));
    return 0;
}
