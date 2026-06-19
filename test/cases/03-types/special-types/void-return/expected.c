#include "runtime.h"

void greet_string(String name) {
    printf("%s\n", name.data);
}

int main(void) {
    TSC_INIT();
    greet_string(STR_LIT("hi"));
    return 0;
}
