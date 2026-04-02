#include "runtime.h"

typedef struct { String name; int32_t age; } User;

int main(void) {
    TSC_INIT();
    User user = {0};
    user.name = STR_LIT("Alice");
    user.age = 30;
    const String *name = &user.name;
    const int32_t *age = &user.age;
    printf("%s\n", name->data);
    printf("%d\n", *age);
    return 0;
}
