#include "runtime.h"

typedef struct { int _dummy; } Validator;

static void Validator_check_inner(const Validator *self, String s) {
    (void)self;
    printf("ok: %s\n", s.data);
}

static void Validator_check(const Validator *self, String s) {
    if (s.length < 3) {
        printf("too short\n");
    } else {
        Validator_check_inner(self, s);
    }
}

int main(void) {
    TSC_INIT();
    Validator v = {0};
    Validator_check(&v, STR_LIT("hi"));
    Validator_check(&v, STR_LIT("hello"));
    return 0;
}
