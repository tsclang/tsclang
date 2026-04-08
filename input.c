#include "runtime.h"

typedef struct { String name; } User;

int main(void) {
    TSC_INIT();
    User u = {0};
    u.name = STR_LIT("Alice");
    printf("%s\n", u.name.data);
    return 0;
}